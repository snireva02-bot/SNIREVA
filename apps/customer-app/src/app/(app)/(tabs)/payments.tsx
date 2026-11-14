import { Clock } from 'lucide-react-native';
import { EmptyState, Screen } from '@/components/ui';

export default function PaymentsTab() {
  return (
    <Screen title="Payments" back={false} tabScreen>
      <EmptyState icon={Clock} title="Coming soon" body="This section is added in a later milestone." />
    </Screen>
  );
}
