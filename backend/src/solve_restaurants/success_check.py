from datetime import datetime, timezone

from .state import FinalResult, StepLog, SolveRestaurantsState


def success_check(state: SolveRestaurantsState) -> dict:
    people_names = {p.name for p in state.people}
    accepted = []
    feedback_by_suggestion: dict[str, list[str]] = {}

    for suggestion in state.suggestions:
        suggestion_id = suggestion.id
        approvals = 0
        for person_name in people_names:
            verdict = state.verdicts.get(person_name, {}).get(suggestion_id)
            if verdict and verdict.verdict.value == "approved":
                approvals += 1
            elif verdict and verdict.verdict.value == "rejected":
                feedback_by_suggestion.setdefault(suggestion_id, []).append(
                    f"{person_name}: {verdict.feedback or 'no feedback'}"
                )
        if approvals == len(people_names):
            accepted.append(suggestion)

    if accepted:
        result = FinalResult(status="consensus", suggestions=accepted)
        log = StepLog(
            node="success_check",
            timestamp=datetime.now(timezone.utc).isoformat(),
            state_snapshot={"accepted_ids": [s.id for s in accepted], "round": state.round},
            notes=[f"Consensus reached on {len(accepted)} suggestion(s)"],
        )
        return {"result": result, "logs": [log]}

    new_round = state.round + 1
    feedback_summary = "; ".join(
        f"{sid}: {', '.join(notes)}" for sid, notes in feedback_by_suggestion.items()
    )
    result = None
    if new_round > 3:
        result = FinalResult(status="no_consensus", suggestions=[])

    log = StepLog(
        node="success_check",
        timestamp=datetime.now(timezone.utc).isoformat(),
        state_snapshot={
            "round": state.round,
            "new_round": new_round,
            "feedback_summary": feedback_summary,
        },
        notes=[
            f"No consensus. Proceeding to round {new_round}."
            if new_round <= 3
            else "No consensus after 3 rounds."
        ],
    )
    return {
        "result": result,
        "round": new_round,
        "feedback_summary": feedback_summary,
        "logs": [log],
    }


def route_after_success_check(state: SolveRestaurantsState) -> str:
    if state.result is not None:
        return "__end__"
    if state.round <= 3:
        return "planner"
    return "__end__"
