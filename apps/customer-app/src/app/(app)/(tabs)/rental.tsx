import { Clock } from 'lucide-react-native';
import { EmptyState, Screen } from '@/components/ui';

export default function RentalTab() {
  return (
    <Screen title="Rental" back={false} tabScreen>
      <EmptyState icon={Clock} title="Coming soon" body="This section is added in a later milestone." />
    </Screen>
  );
}
