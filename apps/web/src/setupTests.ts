import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Con `globals: false`, Testing Library no limpia el DOM sola entre pruebas.
afterEach(cleanup);
