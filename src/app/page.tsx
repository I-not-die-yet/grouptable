import GroupTable from '@/components/GroupTable';
import { menu } from '@/lib/menu';
import { qlooMode } from '@/lib/qloo';
import { agentMode } from '@/lib/agent';
export const dynamic = 'force-dynamic';
export default function Page() {
  return <GroupTable menu={menu} aiMode={process.env.AI_MODE === 'live' ? 'live' : 'fixture'} paymentMode={process.env.PAYMENT_MODE === 'sandbox' ? 'sandbox' : 'fixture'} qlooMode={qlooMode()} agentMode={agentMode()} />;
}
