"""Módulo de Inteligência Visual — fallback com PyAutoGUI + OCR (Módulo 4).

Ativado quando a instalação silenciosa por linha de comando não é
confirmada (ver `installer_core._install_exe`): tira screenshots
periódicos, usa OCR (pytesseract) para localizar texto de botões comuns
de assistentes de instalação — em português e inglês — e clica neles
automaticamente até o instalador terminar ou o tempo limite ser atingido.

Dependências (ver requirements.txt):
  - pyautogui    (screenshot + controlo do rato)
  - pytesseract  (wrapper Python — requer o motor Tesseract OCR instalado
                  à parte no sistema, não é só um pacote pip; ver o link
                  em requirements.txt)

São importadas de forma defensiva: se não estiverem instaladas,
`is_available()` devolve False e `installer_core.py` salta este módulo em
vez de rebentar a aplicação inteira.
"""

import subprocess
import time
from typing import Callable

try:
    import pyautogui
    import pytesseract

    _DEPENDENCIES_AVAILABLE = True
except ImportError:
    pyautogui = None  # type: ignore[assignment]
    pytesseract = None  # type: ignore[assignment]
    _DEPENDENCIES_AVAILABLE = False

LogCallback = Callable[[str], None]

if _DEPENDENCIES_AVAILABLE:
    # Mover o rato para o canto superior esquerdo do ecrã aborta a
    # automação imediatamente (levanta pyautogui.FailSafeException) —
    # mantemos ativo como travão de emergência manual.
    pyautogui.FAILSAFE = True

# Texto procurado por categoria, por ordem de prioridade: primeiro
# aceitar termos/licença, depois avançar, depois instalar, depois
# concluir. Cada categoria tem variantes PT/EN, de frase e de palavra
# única (o OCR nem sempre agrupa frases inteiras na mesma linha).
BUTTON_PRIORITY: list[list[str]] = [
    ["aceito", "concordo", "i agree", "agree", "accept"],
    ["avançar", "avancar", "seguinte", "next", "continuar", "continue"],
    ["instalar", "install"],
    ["concluir", "finish", "close", "fechar", "done", "terminar"],
]

POLL_INTERVAL_SECONDS = 1.5
MAX_DURATION_SECONDS = 180
CONFIDENCE_MIN = 40  # confiança mínima do OCR (0-100) para aceitar o texto


def is_available() -> bool:
    return _DEPENDENCIES_AVAILABLE


def run_visual_fallback(process: subprocess.Popen, log_callback: LogCallback) -> bool:
    """Tenta concluir o assistente de instalação clicando nos botões certos.

    Corre enquanto `process` (o instalador, já em execução com a sua
    interface gráfica visível) continuar vivo, até `MAX_DURATION_SECONDS`.
    Devolve True se o processo terminou, False se o tempo limite foi
    atingido primeiro (o instalador é deixado em execução — pode precisar
    de conclusão manual).
    """
    if not _DEPENDENCIES_AVAILABLE:
        log_callback("Automação visual indisponível: instale 'pyautogui' e 'pytesseract'.")
        return False

    log_callback("A ativar automação visual (PyAutoGUI + OCR) — não mexa no rato/teclado.")

    start = time.monotonic()
    misses = 0

    while process.poll() is None:
        if time.monotonic() - start > MAX_DURATION_SECONDS:
            log_callback(
                f"Tempo limite da automação visual atingido ({MAX_DURATION_SECONDS}s) "
                "— o instalador continua em execução, pode precisar de interação manual."
            )
            return False

        try:
            clicked = _try_click_next_button(log_callback)
        except pyautogui.FailSafeException:
            log_callback("Automação visual abortada pelo utilizador (rato movido para o canto do ecrã).")
            return False

        if clicked:
            misses = 0
        else:
            misses += 1
            if misses % 5 == 0:
                log_callback("A aguardar novo ecrã do instalador...")

        time.sleep(POLL_INTERVAL_SECONDS)

    log_callback("O instalador terminou durante a automação visual.")
    return True


def _try_click_next_button(log_callback: LogCallback) -> bool:
    try:
        screenshot = pyautogui.screenshot()
        data = pytesseract.image_to_data(screenshot, output_type=pytesseract.Output.DICT)
    except pyautogui.FailSafeException:
        raise
    except Exception as error:  # Tesseract mal configurado, ecrã inacessível, etc.
        log_callback(f"Falha na leitura do ecrã (OCR): {error}")
        return False

    for candidates in BUTTON_PRIORITY:
        match = _find_match(data, candidates)
        if match is None:
            continue

        x, y, label = match
        log_callback(f"Botão detetado: '{label}' — a clicar.")
        pyautogui.click(x, y)
        return True

    return False


def _find_match(data: dict, candidates: list[str]) -> tuple[int, int, str] | None:
    for text, x, y in _iter_lines(data):
        normalized = text.lower()
        if any(candidate in normalized for candidate in candidates):
            return x, y, text
    return None


def _iter_lines(data: dict):
    """Agrupa as palavras devolvidas pelo pytesseract em linhas de texto,
    para reconhecer frases como 'Aceito os Termos' ou 'I Agree' em vez de
    apenas palavras isoladas."""
    lines: dict[tuple, dict] = {}
    for i, raw_text in enumerate(data.get("text", [])):
        text = raw_text.strip()
        if not text:
            continue

        confidence = _safe_int(data["conf"][i])
        if confidence < CONFIDENCE_MIN:
            continue

        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        line = lines.setdefault(
            key, {"words": [], "left": [], "top": [], "right": [], "bottom": []}
        )
        line["words"].append(text)
        line["left"].append(data["left"][i])
        line["top"].append(data["top"][i])
        line["right"].append(data["left"][i] + data["width"][i])
        line["bottom"].append(data["top"][i] + data["height"][i])

    for line in lines.values():
        text = " ".join(line["words"])
        x = (min(line["left"]) + max(line["right"])) // 2
        y = (min(line["top"]) + max(line["bottom"])) // 2
        yield text, x, y


def _safe_int(value) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return -1
