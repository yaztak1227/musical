import "./App.css";
import { AppShell } from "./app/AppShell";
import { useAppController } from "./app/hooks/useAppController";

function App() {
  const controller = useAppController();
  return <AppShell controller={controller} />;
}

export default App;
