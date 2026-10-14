import { createContext, useContext } from 'react';

const defaultRequest: typeof fetch = (...args) => fetch(...args);
export const ApiContext = createContext<typeof fetch>(defaultRequest);
export function useApiRequest() {
  return useContext(ApiContext);
}
