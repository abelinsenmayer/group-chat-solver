from datetime import time
from unittest.mock import MagicMock, patch

from src.solve_restaurants.judge import judge
from src.solve_restaurants.state import JudgeVerdict, RestaurantSuggestion, Verdict, person_to_payload
from src.person import Person


def test_judge_approves_suggestion_when_llm_returns_approved():
    person = person_to_payload(Person("A", (time(17), time(20)), (40.0, -73.0), "vegetarian"))
    suggestion = RestaurantSuggestion(
        id="r1", name="Veggie Spot", address="1 Main St", coordinates=(-73.0, 40.0), mapbox_feature={}
    )

    with patch("src.solve_restaurants.judge.TavilyClient") as mock_tavily:
        mock_tavily.return_value.search.return_value = {"results": [{"content": "great vegetarian menu"}]}
        with patch("src.solve_restaurants.judge.ChatOllama") as mock_llm:
            mock_chain = MagicMock()
            mock_chain.invoke.return_value = JudgeVerdict(verdict=Verdict.APPROVED, feedback=None)
            mock_llm.return_value.with_structured_output.return_value = mock_chain
            result = judge({"person": person.model_dump(), "suggestions": [suggestion.model_dump()]})

    assert result["verdicts"]["A"]["r1"].verdict == Verdict.APPROVED
    assert len(result["logs"]) == 1
