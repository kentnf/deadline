"""
server.py — PyInstaller entrypoint for the CoProposal backend.
Reads DATA_DIR, runs Alembic migrations, then starts Uvicorn.
"""
import os
import sys
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    data_dir = os.environ.get("DATA_DIR")
    if data_dir:
        os.makedirs(data_dir, exist_ok=True)

    # When running as a PyInstaller bundle, sys._MEIPASS is the temp extract dir.
    # We need to cd there so relative imports (alembic.ini, alembic/) resolve.
    base_dir = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    os.chdir(base_dir)

    # Run Alembic migrations via Python API (subprocess won't work in a bundle)
    try:
        from alembic.config import Config
        from alembic import command as alembic_command
        alembic_cfg = Config(os.path.join(base_dir, "alembic.ini"))
        alembic_cfg.set_main_option("script_location", os.path.join(base_dir, "alembic"))
        alembic_command.upgrade(alembic_cfg, "head")
    except Exception as e:
        print(f"[server] Migration warning: {e}", file=sys.stderr)

    # Import app directly — uvicorn.run("main:app") doesn't work in a bundle
    from main import app
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
