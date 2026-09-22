import { Component, type ReactNode } from "react";
import { announceStudioRenderFailure } from "@/shared/lib/render-failure-event";

interface Props {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  readonly resetKey: string;
}
/** Optional scenery must never reload, unmount or reset a live domain form. */
export class CampusSceneBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {
    // Report a recoverable surface failure without a URL, stack or private input.
    announceStudioRenderFailure({ surface: "campus-scene", error: new Error("Optional campus scene unavailable"), componentStack: null });
  }
  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
