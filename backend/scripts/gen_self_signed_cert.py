"""
로컬 HTTPS 테스트용 자체 서명 인증서 생성.
backend 폴더에서 실행: python scripts/gen_self_signed_cert.py
생성 파일: certs/key.pem, certs/cert.pem
"""
from pathlib import Path
from datetime import datetime, timedelta
import ipaddress

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# backend 기준 certs 디렉터리
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
CERTS_DIR = BACKEND_DIR / "certs"


def main():
    CERTS_DIR.mkdir(exist_ok=True)
    key_path = CERTS_DIR / "key.pem"
    cert_path = CERTS_DIR / "cert.pem"

    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
    ])

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.utcnow())
        .not_valid_after(datetime.utcnow() + timedelta(days=365))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.DNSName("*.localhost"),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
            ]),
            critical=False,
        )
        .sign(private_key, hashes.SHA256())
    )

    key_path.write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))

    print(f"Created: {key_path}")
    print(f"Created: {cert_path}")
    print("Run HTTPS server:")
    print(f"  uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --ssl-keyfile={key_path} --ssl-certfile={cert_path}")


if __name__ == "__main__":
    main()
