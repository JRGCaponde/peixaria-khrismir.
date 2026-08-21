"""Ponto de entrada do Assistente de Instalação Automatizada."""

from gui import InstallerAssistantApp


def main() -> None:
    app = InstallerAssistantApp()
    app.mainloop()


if __name__ == "__main__":
    main()
