-- MariaDB: did 스키마 + did 사용자 생성 (한 번에 실행)
-- root로 로그인한 뒤 실행하세요.
-- 'your_password' 부분을 본인이 정한 비밀번호로 바꾼 뒤 실행하고,
-- .env의 DATABASE_URL에는 그 비밀번호를 넣으세요. (비밀번호는 공유하지 마세요.)

CREATE DATABASE IF NOT EXISTS did
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- did 전용 사용자 (비밀번호는 반드시 'your_password' 자리를 본인 비밀번호로 변경 후 실행)
CREATE USER IF NOT EXISTS 'did'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON did.* TO 'did'@'localhost';
FLUSH PRIVILEGES;

-- .env 예시:
-- DATABASE_URL=mysql+aiomysql://did:여기에_설정한_비밀번호@localhost:3306/did
