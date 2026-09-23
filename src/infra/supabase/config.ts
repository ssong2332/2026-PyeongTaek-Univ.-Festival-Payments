function requireValue(value: string | undefined, name: string): string {
    const result = value?.trim();
    if (!result || result.startsWith("your-")) {
        throw new Error(`${name} 설정이 필요합니다. .env.example을 참고하세요.`);
    }
    return result;
}

export function readSupabaseUrl(value: string | undefined): string {
    const result = requireValue(value, "NEXT_PUBLIC_SUPABASE_URL");
    try {
        const url = new URL(result);
        const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if ((url.protocol !== "https:" && !(local && url.protocol === "http:"))
            || url.hostname === "your-project-ref.supabase.co"
            || url.username || url.password || url.search || url.hash
            || url.pathname !== "/") {
            throw new Error();
        }
    } catch {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL에 올바른 Supabase 프로젝트 주소를 입력하세요.");
    }
    return result.replace(/\/$/, "");
}

function isServerKey(value: string): boolean {
    if (value.startsWith("sb_secret_")) return true;
    try {
        const payload = value.split(".")[1];
        return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
    } catch {
        return false;
    }
}

export function readPublicConfig(url: string | undefined, key: string | undefined) {
    const publicKey = requireValue(key, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
    if (isServerKey(publicKey)) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY에는 공개 키만 입력하세요. 서버 비밀 키는 사용할 수 없습니다.");
    }
    return { url: readSupabaseUrl(url), key: publicKey };
}

export function requireServerKey(value: string | undefined): string {
    return requireValue(value, "SUPABASE_SERVICE_ROLE_KEY");
}
