import { Clock } from 'lucide-react-native';
import { EmptyState, Screen } from '@/components/ui';

export default function SupportTab() {
  return (
    <Screen title="Support" back={false} tabScreen>
      <EmptyState icon={Clock} title="Coming soon" body="This section is added in a later milestone." />
    </Screen>
  );
}
