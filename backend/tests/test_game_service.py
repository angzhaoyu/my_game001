from __future__ import annotations

import copy
import unittest
from contextlib import AbstractContextManager

from app.domain.errors import VersionConflictError
from app.domain.models import GameAggregate, Plot
from app.services.game_service import GameService


class FakeUnitOfWork(AbstractContextManager):
    def __init__(self, repository):
        self.repository = repository
        self.state = copy.deepcopy(repository.state)
        self.commands = copy.deepcopy(repository.commands)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            self.repository.state = self.state
            self.repository.commands = self.commands
        return False

    def load(self, user_id, lock=True):
        if user_id != self.state.user_id:
            raise AssertionError("wrong user")
        return self.state

    def save(self, state):
        self.state = state

    def get_processed_command(self, user_id, command_id):
        return self.commands.get((user_id, command_id))

    def save_processed_command(self, user_id, command_id, response):
        self.commands[(user_id, command_id)] = copy.deepcopy(response)


class FakeRepository:
    def __init__(self):
        self.state = GameAggregate(
            user_id=7,
            username="测试玩家",
            region="大区一 · 电信",
            created_at_ms=1,
            coins=500,
            version=1,
            last_simulated_at_ms=1_000_000,
            plots={index: Plot(index) for index in range(1, 25)},
        )
        self.commands = {}

    def transaction(self):
        return FakeUnitOfWork(self)


class GameServiceTest(unittest.TestCase):
    def setUp(self):
        self.repo = FakeRepository()
        self.service = GameService(self.repo, clock=lambda: 1_000_001)

    def test_repeated_command_is_idempotent(self):
        first = self.service.command(7, "command-0001", 1, "buy_item", {"itemId": "seed_wheat", "quantity": 2})
        second = self.service.command(7, "command-0001", 1, "buy_item", {"itemId": "seed_wheat", "quantity": 2})
        self.assertEqual(first, second)
        self.assertEqual(self.repo.state.coins, 464)
        self.assertEqual(self.repo.state.inventory["seed_wheat"].count, 2)
        self.assertEqual(self.repo.state.version, 2)

    def test_replay_returns_current_snapshot_without_executing_again(self):
        self.service.command(7, "command-0003", 1, "buy_item", {"itemId": "seed_wheat"})
        # 模拟另一台设备随后完成了一个操作。
        self.repo.state.coins += 10
        self.repo.state.version += 1
        replay = self.service.command(7, "command-0003", 1, "buy_item", {"itemId": "seed_wheat"})
        self.assertEqual(replay["stateVersion"], 3)
        self.assertEqual(replay["profile"]["coins"], 492)
        self.assertEqual(self.repo.state.inventory["seed_wheat"].count, 1)

    def test_stale_version_rolls_back(self):
        with self.assertRaises(VersionConflictError) as caught:
            self.service.command(7, "command-0002", 99, "buy_item", {"itemId": "seed_wheat"})
        self.assertEqual(caught.exception.details["currentVersion"], 1)
        self.assertEqual(self.repo.state.coins, 500)
        self.assertNotIn("seed_wheat", self.repo.state.inventory)

    def test_bootstrap_contains_server_catalog_and_no_client_fixture(self):
        result = self.service.bootstrap(7)
        self.assertEqual(result["profile"]["id"], 7)
        self.assertIn("catalog", result)
        self.assertGreater(len(result["catalog"]["shopItems"]), 0)
        self.assertEqual(result["inventory"], [])


if __name__ == "__main__":
    unittest.main()
