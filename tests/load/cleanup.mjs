import { createClient } from '@supabase/supabase-js';
import { TEST_ORDER_IDEMPOTENCY_PREFIX, aggregateStockRestoration } from './cleanupLogic.js';

/**
 * T-29: k6 부하 검증 생성 주문 정리 스크립트
 *
 * Tasks.md:
 * "k6가 운영 DB에 만든 테스트 주문은 실행 직후 정리해야 한다(정리 방법은 T-29 착수 시 확정)."
 *
 * 식별 패턴:
 * - idempotency_key가 '00000000-0000-4a29-%'로 시작하는 테스트 주문
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[Cleanup Error] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경 변수가 누락되었습니다.');
  console.error('실행 예시: node --env-file-if-exists=.env.local tests/load/cleanup.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const restoreStock = !process.argv.includes('--no-restore-stock');
  const queryPattern = `${TEST_ORDER_IDEMPOTENCY_PREFIX}%`;

  console.log('================================================================');
  console.log('           T-29 k6 부하 테스트 주문 정리 (Cleanup)');
  console.log('================================================================');
  console.log(`- 모드: ${isDryRun ? 'DRY RUN (실제 삭제하지 않음)' : '실제 정리 실행'}`);
  console.log(`- 식별 패턴: idempotency_key LIKE ${queryPattern}`);

  // 1. 대상 주문 조회
  const { data: testOrders, error: findError } = await supabase
    .from('orders')
    .select('id, pickup_number, created_at, status, total_amount, idempotency_key')
    .like('idempotency_key', queryPattern);

  if (findError) {
    console.error('[Cleanup Error] 테스트 주문 조회 실패:', findError.message);
    process.exit(1);
  }

  const count = testOrders ? testOrders.length : 0;
  console.log(`- 발견된 테스트 주문: 총 ${count} 건`);

  if (count === 0) {
    console.log('정리할 테스트 주문이 없습니다.');
    return;
  }

  // 2. 재고 복구 처리 (필요 시)
  if (restoreStock && !isDryRun) {
    console.log('- 차감된 메뉴 재고 복구 계산 중...');
    const orderIds = testOrders.map((o) => o.id);

    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity')
      .in('order_id', orderIds);

    if (!itemsError && orderItems && orderItems.length > 0) {
      const stockToRestore = aggregateStockRestoration(orderItems);

      for (const [menuItemId, qty] of Object.entries(stockToRestore)) {
        // 현재 재고 조회 후 가산
        const { data: currentMenu } = await supabase
          .from('menu_items')
          .select('stock')
          .eq('id', menuItemId)
          .single();

        if (currentMenu) {
          const newStock = currentMenu.stock + qty;
          await supabase
            .from('menu_items')
            .update({ stock: newStock })
            .eq('id', menuItemId);
          console.log(`  메뉴(${menuItemId}) 재고 복구: +${qty} (현재: ${newStock})`);
        }
      }
    }
  }

  if (isDryRun) {
    console.log(`[DRY RUN 완료] 실제 삭제 시 총 ${count}건의 주문 및 연관 데이터가 삭제됩니다.`);
    return;
  }

  // 3. 테스트 주문 삭제 (ON DELETE CASCADE로 order_items, order_status_history 함께 삭제)
  const { error: deleteError } = await supabase
    .from('orders')
    .delete()
    .like('idempotency_key', queryPattern);

  if (deleteError) {
    console.error('[Cleanup Error] 테스트 주문 삭제 실패:', deleteError.message);
    process.exit(1);
  }

  console.log(`- 정리 완료: ${count}건의 테스트 주문 및 연관 데이터가 성공적으로 삭제되었습니다.`);
  console.log('================================================================');
}

main().catch((err) => {
  console.error('[Cleanup Error] 예외 발생:', err);
  process.exit(1);
});
