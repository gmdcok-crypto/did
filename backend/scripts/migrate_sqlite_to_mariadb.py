"""
SQLite(app.db) 데이터를 MySQL/MariaDB로 옮기는 스크립트.
실행 전: 대상 DB가 접속 가능해야 함 (로컬·Railway 등, DATABASE_URL).
  백엔드가 한 번이라도 MariaDB로 기동되어 테이블이 생성되어 있어야 함.

사용:
  cd backend
  venv\\Scripts\\activate
  python scripts/migrate_sqlite_to_mariadb.py [--sqlite path] [--mariadb-url URL]
"""
from __future__ import annotations

import argparse
import os
import sys

# 프로젝트 루트를 path에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load_dotenv() -> None:
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(backend_dir, ".env")
    if os.path.isfile(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    k, v = k.strip(), v.strip().strip("'\"").strip()
                    os.environ.setdefault(k, v)


def _default_mariadb_url() -> str:
    """backend .env의 MYSQL_* 로 URL 생성 (호스트는 127.0.0.1)."""
    _load_dotenv()
    user = os.environ.get("MYSQL_USER", "did")
    password = os.environ.get("MYSQL_PASSWORD", "didpass")
    db = os.environ.get("MYSQL_DATABASE", "did")
    return f"mysql+pymysql://{user}:{password}@127.0.0.1:3306/{db}"


_load_dotenv()

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

# 모델 로드해서 Base.metadata에 테이블 등록
from app.database import Base
from app.models import (  # noqa: F401
    User,
    Device,
    DeviceGroup,
    Content,
    Campaign,
    CampaignContent,
    Schedule,
    ScheduleSlot,
    PlaybackEvent,
)

SQLITE_DEFAULT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "app.db")
MARIADB_DEFAULT = _default_mariadb_url()


def get_sqlite_engine(path: str) -> Engine:
    return create_engine(f"sqlite:///{path}")


def get_mariadb_engine(url: str) -> Engine:
    return create_engine(url)


def migrate(sqlite_path: str, mariadb_url: str) -> None:
    if not os.path.isfile(sqlite_path):
        print(f"SQLite 파일이 없습니다: {sqlite_path}")
        sys.exit(1)

    eng_sqlite = get_sqlite_engine(sqlite_path)
    eng_mariadb = get_mariadb_engine(mariadb_url)

    # 테이블 순서(FK 의존성)
    tables = list(Base.metadata.sorted_tables)

    with eng_mariadb.connect() as conn_m:
        conn_m.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        conn_m.commit()

    for table in tables:
        name = table.name
        with eng_sqlite.connect() as conn_s:
            result = conn_s.execute(table.select())
            rows = [dict(r._mapping) for r in result]
        if not rows:
            print(f"  {name}: (비어 있음)")
            continue
        with eng_mariadb.begin() as conn_m:
            conn_m.execute(text(f"DELETE FROM `{name}`"))
            for row_dict in rows:
                # MariaDB 테이블에 있는 컬럼만 넣기
                ins = table.insert().values(**{k: v for k, v in row_dict.items() if k in table.c})
                conn_m.execute(ins)
        print(f"  {name}: {len(rows)} 행 복사")

    with eng_mariadb.connect() as conn_m:
        conn_m.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        conn_m.commit()

    print("마이그레이션 완료.")


def main():
    parser = argparse.ArgumentParser(description="SQLite -> MariaDB 데이터 이전")
    parser.add_argument("--sqlite", default=SQLITE_DEFAULT, help="SQLite 파일 경로")
    parser.add_argument(
        "--mariadb-url",
        default=os.environ.get("MARIADB_URL", _default_mariadb_url()),
        help="MariaDB URL (기본: .env의 MYSQL_USER/MYSQL_PASSWORD 사용, 호스트 127.0.0.1)",
    )
    args = parser.parse_args()
    migrate(args.sqlite, args.mariadb_url)


if __name__ == "__main__":
    main()
