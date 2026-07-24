import QRCode from "qrcode";

export type VietQrInput = {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amountMinorUnits: bigint | string | number;
  transferReference: string;
};

const NAPAS_APPLICATION_ID = "A000000727";
const NAPAS_ACCOUNT_SERVICE = "QRIBFTTA";
const VIETNAM_CURRENCY_CODE = "704";

function field(id: string, value: string) {
  if (value.length > 99) {
    throw new Error(`VietQR field ${id} is too long.`);
  }
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function ascii(value: string, maxLength: number) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeAccountNumber(value: string) {
  const normalized = value.replace(/[\s.-]/g, "");
  if (!/^[A-Za-z0-9]{1,34}$/.test(normalized)) {
    throw new Error("The bank account number is not valid for VietQR.");
  }
  return normalized;
}

function normalizeAmount(value: bigint | string | number) {
  const minorUnits = BigInt(value);
  if (minorUnits <= BigInt(0) || minorUnits % BigInt(100) !== BigInt(0)) {
    throw new Error(
      "The reservation total must be a positive whole VND amount.",
    );
  }
  return (minorUnits / BigInt(100)).toString();
}

function crc16CcittFalse(value: string) {
  let crc = 0xffff;
  for (const character of value) {
    crc ^= character.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildVietQrPayload(input: VietQrInput) {
  if (!/^\d{6}$/.test(input.bankCode)) {
    throw new Error("VietQR requires a six-digit bank BIN/code.");
  }

  const accountNumber = normalizeAccountNumber(input.accountNumber);
  const accountName = ascii(input.accountName, 25) || "CYFURDEN";
  const transferReference = ascii(input.transferReference, 25);
  if (!transferReference) {
    throw new Error("VietQR requires a transfer reference.");
  }

  const beneficiary = field("00", input.bankCode) + field("01", accountNumber);
  const merchantAccount =
    field("00", NAPAS_APPLICATION_ID) +
    field("01", beneficiary) +
    field("02", NAPAS_ACCOUNT_SERVICE);
  const additionalData = field("08", transferReference);
  const payloadWithoutCrc =
    field("00", "01") +
    field("01", "12") +
    field("38", merchantAccount) +
    field("52", "0000") +
    field("53", VIETNAM_CURRENCY_CODE) +
    field("54", normalizeAmount(input.amountMinorUnits)) +
    field("58", "VN") +
    field("59", accountName) +
    field("62", additionalData) +
    "6304";

  return `${payloadWithoutCrc}${crc16CcittFalse(payloadWithoutCrc)}`;
}

export async function generateVietQrDataUrl(input: VietQrInput) {
  const payload = buildVietQrPayload(input);
  return QRCode.toDataURL(payload, {
    width: 320,
    margin: 3,
    errorCorrectionLevel: "M",
    color: { dark: "#18233a", light: "#ffffff" },
  });
}
