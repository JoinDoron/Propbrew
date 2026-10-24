'use client';

import { createContext } from 'react';

/** A stable, shell-owned DOM outlet. Panel state and data remain page-local. */
export const PageTabsHeaderContext = createContext<HTMLElement | null>(null);
