import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// T-25: OpenNext 기본 설정을 그대로 쓴다. 이 앱은 ISR·`use cache`·on-demand revalidation을 쓰지 않아
// 증분 캐시(R2)·태그 캐시·큐를 따로 두지 않는다. 캐시가 필요해지면 여기에 명시한다.
export default defineCloudflareConfig({});
