import pytest

from src.solve_restaurants import events


def test_emit_delivers_events_to_the_subscribed_queue():
    events.create_run("run-1")
    events.emit("run-1", {"type": "planner_started", "round": 1})

    run_queue = events.subscribe("run-1")
    assert run_queue.get_nowait() == {"type": "planner_started", "round": 1}

    events.discard("run-1")


def test_emit_on_unknown_run_id_does_not_raise():
    events.emit("does-not-exist", {"type": "planner_started", "round": 1})


def test_subscribe_on_unknown_run_id_raises_key_error():
    with pytest.raises(KeyError):
        events.subscribe("does-not-exist")


def test_close_run_pushes_the_sentinel():
    events.create_run("run-2")
    events.close_run("run-2")

    run_queue = events.subscribe("run-2")
    assert run_queue.get_nowait() is events.SENTINEL

    events.discard("run-2")


def test_discard_removes_the_run():
    events.create_run("run-3")
    events.discard("run-3")

    with pytest.raises(KeyError):
        events.subscribe("run-3")
