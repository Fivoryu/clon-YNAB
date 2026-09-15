'use client';

import { AuthScreen } from './components/AuthScreen';
import { BudgetWorkspace } from './components/BudgetWorkspace';
import { SetupScreen } from './components/SetupScreen';
import { useBudgetApp } from './hooks/useBudgetApp';

export default function Home() {
  const app = useBudgetApp();

  if (!app.budget) {
    return (
      <AuthScreen
        email={app.email}
        password={app.password}
        message={app.message}
        onEmailChange={app.setEmail}
        onPasswordChange={app.setPassword}
        onAuthenticate={app.authenticate}
        onContinue={app.startOrResume}
      />
    );
  }

  if (app.budget.setupStep !== 'COMPLETE') {
    return (
      <SetupScreen
        budget={app.budget}
        accountName={app.accountName}
        opening={app.opening}
        categoryNames={app.categoryNames}
        message={app.message}
        onAccountNameChange={app.setAccountName}
        onOpeningChange={app.setOpening}
        onCategoryNamesChange={app.setCategoryNames}
        onSave={app.saveSetup}
        onSignOut={app.signOut}
      />
    );
  }

  return <BudgetWorkspace app={app} />;
}
