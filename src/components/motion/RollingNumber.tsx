// 숫자가 바뀌면 자릿수마다 기존 숫자가 위로 빠지고 새 숫자가 아래에서 올라온다(globals.css .roll).
// 화면 읽기 프로그램·글자 검색에는 sr-only의 완성된 값 하나만 보인다.
export function RollingNumber({ value, className = "" }: { value: string; className?: string }) {
    return (
        <span className={`relative inline-flex ${className}`}>
            <span aria-hidden="true" className="roll">
                {Array.from(value).map((char, index) =>
                    /\d/.test(char) ? (
                        // 자리 위치(오른쪽 기준)로 key를 잡아 자릿수가 늘어도 일의 자리는 같은 띠가 굴러간다.
                        <span key={`d${value.length - index}`} className="roll-d">
                            <i style={{ transform: `translateY(${-Number(char) * 1.12}em)` }} />
                        </span>
                    ) : (
                        <span key={`c${value.length - index}`} className="roll-c" data-c={char} />
                    ),
                )}
            </span>
            <span className="sr-only">{value}</span>
        </span>
    );
}
