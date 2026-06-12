import "./App.css";
import { AppShell } from "./app/AppShell";
import { useAppController } from "./app/hooks/useAppController";
import { TvDisplayApp } from "./features/tv-display/presentation/TvDisplayApp";

function App() {
  if (window.location.pathname === "/tv") {
    return <TvDisplayApp />;
  }

  return <MusicalApp />;
}

function MusicalApp() {
  const controller = useAppController();
  return <AppShell controller={controller} />;
}

export default App;
