import { ErrorBoundary } from './client/components/ErrorBoundary';
import { RegistrationPage } from './client/pages/RegistrationPage';

export default function App() {
  return (
    <ErrorBoundary>
      <RegistrationPage />
    </ErrorBoundary>
  );
}
