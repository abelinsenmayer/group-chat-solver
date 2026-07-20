import importlib.util
from pathlib import Path
from unittest.mock import patch


def _load_script_module():
    script_path = Path(__file__).resolve().parent.parent / "scripts" / "direct_prompt.py"
    spec = importlib.util.spec_from_file_location("direct_prompt_script", script_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_main_prints_model_reply(monkeypatch, capsys) -> None:
    module = _load_script_module()
    monkeypatch.setattr("sys.argv", ["direct_prompt.py", "Hello"])

    with patch.object(module, "direct_prompt", return_value="Reply") as prompt:
        assert module.main() == 0

    assert capsys.readouterr().out == "Reply\n"
    prompt.assert_called_once_with("Hello", backend="ollama")


def test_main_reports_model_error(monkeypatch, capsys) -> None:
    module = _load_script_module()
    monkeypatch.setattr("sys.argv", ["direct_prompt.py", "Hello", "--backend", "unknown"])

    with patch.object(
        module,
        "direct_prompt",
        side_effect=ValueError("Unsupported model backend: unknown"),
    ):
        assert module.main() == 1

    assert "Unsupported model backend: unknown" in capsys.readouterr().err
