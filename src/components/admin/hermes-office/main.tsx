import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import OfficeApp from "./OfficeApp";
import "./office.css";

class OfficeBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* User content never enters console logs. */
  }
  render() {
    return this.state.failed ? (
      <main style={{ padding: 32 }}>
        <h1>화면을 다시 불러와 주세요</h1>
        <p>저장하지 않은 입력은 사라질 수 있습니다. 저장 여부는 다시 연결한 뒤 확인하세요.</p>
        <button onClick={() => location.reload()}>다시 불러오기</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <React.StrictMode>
      <OfficeBoundary>
        <OfficeApp />
      </OfficeBoundary>
    </React.StrictMode>,
  );
