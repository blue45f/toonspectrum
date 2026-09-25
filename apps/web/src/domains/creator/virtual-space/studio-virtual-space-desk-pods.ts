import type * as Phaser from "phaser";

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { STUDIO_TOWN_DESK_PODS } from "./studio-virtual-space-town-program";

interface DeskPodVisual {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
  readonly ring: Phaser.GameObjects.Ellipse;
  readonly label: Phaser.GameObjects.Text;
  readonly status: Phaser.GameObjects.Text;
}

export class StudioDeskPodRuntime {
  private readonly pods: readonly DeskPodVisual[];

  constructor(scene: Phaser.Scene) {
    this.pods = STUDIO_TOWN_DESK_PODS.map((pod) => {
      const ring = scene.add.ellipse(pod.point.x, pod.point.y, 132, 72, 0x7bcfff, .035)
        .setStrokeStyle(2, 0x91d9ff, .18).setDepth(pod.point.y + 720);
      const label = scene.add.text(pod.point.x, pod.point.y - 44, pod.labelKo, {
        fontFamily: "Inter, Pretendard, sans-serif", fontSize: "9px", fontStyle: "bold",
        color: "#dff7ff", backgroundColor: "#11243acc", padding: { x: 5, y: 2 },
      }).setOrigin(.5).setDepth(pod.point.y + 725);
      const status = scene.add.text(pod.point.x, pod.point.y + 42, "", {
        fontFamily: "Inter, Pretendard, sans-serif", fontSize: "8px",
        color: "#a8e7c2", backgroundColor: "#0b1a23bb", padding: { x: 4, y: 2 },
      }).setOrigin(.5).setDepth(pod.point.y + 725).setVisible(false);
      return { id: pod.id, point: pod.point, ring, label, status };
    });
  }

  update(people: readonly { readonly point: StudioVirtualSpacePoint; readonly focused?: boolean }[], time: number, reducedMotion: boolean): void {
    for (const [index, pod] of this.pods.entries()) {
      const occupants = people.filter((person) => Math.hypot(person.point.x - pod.point.x, person.point.y - pod.point.y) <= 75);
      const focused = occupants.filter((person) => person.focused).length;
      pod.status.setText(occupants.length ? `${occupants.length} · ${focused ? `FOCUS ${focused}` : "ACTIVE"}` : "")
        .setVisible(occupants.length > 0);
      const pulse = reducedMotion ? 1 : 1 + Math.sin(time * .002 + index) * .025;
      pod.ring.setScale(pulse).setFillStyle(focused ? 0xffbd6d : 0x7bcfff, occupants.length ? .08 : .035)
        .setStrokeStyle(2, focused ? 0xffd08c : 0x91d9ff, occupants.length ? .42 : .18);
      pod.label.setAlpha(occupants.length ? 1 : .72);
    }
  }

  destroy(): void {
    this.pods.forEach((pod) => { pod.ring.destroy(); pod.label.destroy(); pod.status.destroy(); });
  }
}
