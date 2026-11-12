import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("TC Developer failed to render:", error); }
  render() {
    if (this.state.error) return <main className="fatal"><section><span>TC DEVELOPER ERROR</span><h1>TC Developer couldn't load</h1><p>{String(this.state.error?.message || this.state.error)}</p><button onClick={() => window.location.reload()}>Reload</button></section></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>);
