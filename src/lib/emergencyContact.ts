// 관리자 화면 비상 연락처(학회장). 저장소가 공개라 번호는 코드에 적지 않고 서버 환경변수 EMERGENCY_CONTACT_PHONE에서 읽는다.
// 로그인한 관리자 화면(서버 컴포넌트)에서만 읽어 넘기므로 고객 화면·공개 번들에는 실리지 않는다.
export type EmergencyContact = { display: string; tel: string };

export function readEmergencyContact(value: string | undefined = process.env.EMERGENCY_CONTACT_PHONE): EmergencyContact | null {
    const digits = (value ?? "").replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 11) return null;
    const display =
        digits.length === 11
            ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
            : digits.startsWith("02")
              ? `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`
              : `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
    return { display, tel: `tel:${digits}` };
}
