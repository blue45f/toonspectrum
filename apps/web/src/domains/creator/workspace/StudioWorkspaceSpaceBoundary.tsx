import { Component, type ReactNode } from "react";

interface SpaceBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
}

/** Optional space-view failure must not replace navigation, selection or recovery. */
export class StudioWorkspaceSpaceBoundary extends Component<SpaceBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    // The user explicitly switches to list view. No renderer or storage is replaced.
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
