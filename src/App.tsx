/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';
import { AdminPage } from './pages/AdminPage';
import { AssignmentPage } from './pages/AssignmentPage';
import { TrackingPage } from './pages/TrackingPage';
import { ReportsPage } from './pages/ReportsPage';

export default function App() {
  const [currentView, setCurrentView] = useState('tracking');

  return (
    <AppProvider>
      <Layout currentView={currentView} onViewChange={setCurrentView}>
        {currentView === 'admin' && <AdminPage />}
        {currentView === 'assign' && <AssignmentPage />}
        {currentView === 'tracking' && <TrackingPage />}
        {currentView === 'reports' && <ReportsPage />}
      </Layout>
    </AppProvider>
  );
}
