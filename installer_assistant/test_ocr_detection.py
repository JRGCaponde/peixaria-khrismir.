"""Teste isolado de deteção OCR — NÃO clica em nada.

Script autónomo para validares se o OCR (pytesseract) consegue mesmo
reconhecer os botões do teu instalador antes de confiares no clique
automático do `visual_fallback.py`. Só olha para o ecrã e reporta o que
encontrou — é seguro correr contra qualquer instalador aberto.

Como usar:
  1. Abre o instalador que queres testar e deixa visível o ecrã com o
     botão que queres detetar (ex.: "Avançar", "Aceito os Termos").
  2. Corre: python test_ocr_detection.py
  3. Tens 5 segundos para clicar na janela do instalador antes da
     captura (para ela ficar em primeiro plano).
  4. No fim, olha para:
       - a lista impressa na consola (tudo o que o OCR leu, com confiança)
       - o ficheiro 'ocr_debug.png' gerado nesta pasta, com retângulos:
           verde  = texto que bateu com um botão-alvo (o que seria clicado)
           amarelo = outro texto detetado, só para referência

Corre isto uma vez por cada ecrã do teu instalador (licença, opções,
progresso, conclusão) para veres onde o OCR funciona bem e onde falha.
"""

import sys
import time

try:
    import pyautogui
    import pytesseract
    from PIL import ImageDraw
except ImportError as error:
    print(f"Dependência em falta: {error}")
    print("Corre primeiro: pip install -r requirements.txt")
    print("E confirma que o motor Tesseract OCR está instalado (ver requirements.txt).")
    sys.exit(1)

from visual_fallback import BUTTON_PRIORITY, CONFIDENCE_MIN, _iter_lines

COUNTDOWN_SECONDS = 5
OUTPUT_IMAGE = "ocr_debug.png"


def main() -> None:
    print(f"A capturar o ecrã em {COUNTDOWN_SECONDS} segundos — muda para o instalador agora...")
    for remaining in range(COUNTDOWN_SECONDS, 0, -1):
        print(f"  {remaining}...")
        time.sleep(1)

    screenshot = pyautogui.screenshot()

    try:
        data = pytesseract.image_to_data(screenshot, output_type=pytesseract.Output.DICT)
    except Exception as error:
        print(f"\nFalha ao correr o OCR: {error}")
        print("Verifica se o Tesseract está instalado e no PATH (ou configura")
        print("pytesseract.pytesseract.tesseract_cmd manualmente — ver requirements.txt).")
        sys.exit(1)

    lines = list(_iter_lines(data))

    print(f"\n=== Texto detetado (confiança >= {CONFIDENCE_MIN}) ===")
    if not lines:
        print("Nada foi reconhecido. Possíveis causas: Tesseract mal configurado,")
        print("texto pequeno demais, ou o instalador não estava em primeiro plano.")
    for text, x, y in lines:
        print(f"  '{text}'  (centro: {x}, {y})")

    print("\n=== Correspondências com botões-alvo (o que seria clicado) ===")
    matches = []
    for candidates in BUTTON_PRIORITY:
        found_for_category = False
        for text, x, y in lines:
            normalized = text.lower()
            if any(candidate in normalized for candidate in candidates):
                print(f"  Categoria {candidates[:2]}... -> '{text}' em ({x}, {y})")
                matches.append((text, x, y))
                found_for_category = True
        if not found_for_category:
            print(f"  Categoria {candidates[:2]}... -> nenhuma correspondência")

    _save_debug_image(screenshot, lines, matches)
    print(f"\nImagem anotada guardada em: {OUTPUT_IMAGE}")
    print("(verde = correspondência com botão-alvo, amarelo = outro texto detetado)")


def _save_debug_image(screenshot, lines, matches) -> None:
    annotated = screenshot.copy()
    draw = ImageDraw.Draw(annotated)
    matched_texts = {text for text, _, _ in matches}

    for text, x, y in lines:
        color = "lime" if text in matched_texts else "yellow"
        box_size = 40
        draw.rectangle(
            [x - box_size, y - 10, x + box_size, y + 10],
            outline=color,
            width=2,
        )

    annotated.save(OUTPUT_IMAGE)


if __name__ == "__main__":
    main()
