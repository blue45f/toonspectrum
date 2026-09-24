#![cfg(feature = "hybrid")]

use studio_engine_vello::hybrid_scene::encode_hybrid_scene;
use studio_engine_vello::scene::{
    BlendModeIR, ColorIR, FillRuleIR, PaintIR, PathIR, PathVerbIR, SceneIR, SceneNodeIR,
};

fn triangle() -> PathIR {
    PathIR {
        verbs: vec![
            PathVerbIR::M { x: 2.0, y: 2.0 },
            PathVerbIR::L { x: 30.0, y: 2.0 },
            PathVerbIR::L { x: 16.0, y: 30.0 },
            PathVerbIR::Z,
        ],
    }
}

#[test]
fn encodes_the_bounded_vector_subset_without_panicking() {
    let scene = SceneIR {
        version: 11,
        width: 32,
        height: 32,
        background: ColorIR {
            r: 1.0,
            g: 1.0,
            b: 1.0,
            a: 1.0,
        },
        nodes: vec![SceneNodeIR::FillPath {
            id: "triangle".into(),
            path: triangle(),
            paint: PaintIR::Solid {
                color: ColorIR {
                    r: 0.2,
                    g: 0.4,
                    b: 0.8,
                    a: 1.0,
                },
            },
            opacity: 0.8,
            blend: BlendModeIR::Multiply,
            fill_rule: FillRuleIR::NonZero,
        }],
    };
    assert!(encode_hybrid_scene(&scene).is_ok());
}

#[test]
fn rejects_paragraph_text_before_hybrid_gpu_work() {
    let scene = SceneIR {
        version: 11,
        width: 32,
        height: 32,
        background: ColorIR {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: 0.0,
        },
        nodes: vec![SceneNodeIR::Text {
            id: "text".into(),
            opacity: 1.0,
            blend: BlendModeIR::SrcOver,
            x: 0.0,
            y: 10.0,
            text: "no silent drop".into(),
            font_size_px: 12.0,
            color: ColorIR {
                r: 0.0,
                g: 0.0,
                b: 0.0,
                a: 1.0,
            },
            font_family: "sans-serif".into(),
        }],
    };
    assert_eq!(
        encode_hybrid_scene(&scene).unwrap_err(),
        vec!["render.text.paragraph".to_string()],
    );
}
