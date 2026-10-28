import GroupTable from '@/components/GroupTable';
import { menu } from '@/lib/menu';
export const dynamic = 'force-dynamic';
export default function Page() {
  return <GroupTable menu={menu} aiMode={process.env.AI_MODE === 'live' ? 'live' : 'fixture'} paymentMode={process.env.PAYMENT_MODE === 'sandbox' ? 'sandbox' : 'fixture'} />;
}
