import { PatientHome } from './patient/PatientHome';
import { RevocationPlaceholder } from './patient/RevocationPlaceholder';
import { REVOKE_PATH } from './patient/texts';

export function App() {
  return window.location.pathname === REVOKE_PATH ? <RevocationPlaceholder /> : <PatientHome />;
}
