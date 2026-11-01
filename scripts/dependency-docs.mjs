import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const project = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
// Offsets are UTF-16 code units in the exact pinned upstream text.
const edits = [
  [
    "@mapbox/tiny-sdf/README.md",
    "ef57d1f18f29146bf48e13b0dd08454fcefe94f81c1a93755ec80af0c12c91e1",
    "926c57c1b0e1970313209869e93e77ecdf47c00e487f23a014ed7803b36bbb88",
    [
      [
        1315,
        1316,
        "Ａ"
      ]
    ]
  ],
  [
    "@napi-rs/canvas/README.md",
    "1051a72627f361ae5ec3abd67804b5f6f46f292cebe903f1de5e019892576a87",
    "1f97f778caa72423c0cd26443fcb7925d5b0ee67ddfaeb1578bd300d39fd3e53",
    [
      [
        722,
        729,
        "<!-- Alternate-language link omitted in this local edition"
      ],
      [
        730,
        737,
        " "
      ],
      [
        738,
        744,
        "->"
      ]
    ]
  ],
  [
    "commander/Readme.md",
    "7773d17df18ed747f06c12fb13c2459e94c622dc6921b7ab3b73176343855e55",
    "02125e6d7a1f24774f8bb0a404ffc3ca61bfc7433b37162bb2317f308baf9aba",
    [
      [
        659,
        676,
        ""
      ],
      [
        683,
        693,
        ""
      ],
      [
        694,
        711,
        ""
      ]
    ]
  ],
  [
    "fflate/README.md",
    "021950f8aa043d57876d65917abb546c29de4007e8f873cac142c5394d4e17bc",
    "35030a42a52b88df70f1e65158fd625aa3a3ed36f60dcef73cb5b3d8c23b1a0a",
    [
      [
        10982,
        10984,
        "greeting"
      ],
      [
        12082,
        12084,
        "greeting"
      ]
    ]
  ],
  [
    "is-fullwidth-code-point/readme.md",
    "17df4cd59773b379650f1d15fb4e4333a1c7ff9e391a91b99961f65eed39384a",
    "6f622e86626a99676f08b218b91667818039370b440fd02a8f0068a6ec3d079f",
    [
      [
        536,
        537,
        "Ａ"
      ]
    ]
  ],
  [
    "katex/node_modules/commander/Readme.md",
    "9ee7c537cb5e335e2e9c383b3b08ee7361fd227fb83c86ffa35eedc9c7f92877",
    "33e4bdbfd8c24bf7f143000582602d2658b903870aed3d8c6c94e773942b85f0",
    [
      [
        620,
        637,
        ""
      ],
      [
        644,
        654,
        ""
      ],
      [
        655,
        672,
        ""
      ]
    ]
  ],
  [
    "mdast-util-gfm-table/readme.md",
    "e87d49b36c58ad19eb9adba7530c06160619f5dbf40833ea2c410812f7487b69",
    "e931e7d56f75ce9f64f51018f9ebb9ab65c32bf92c8311ffc1f5d9575145eeb7",
    [
      [
        6481,
        6483,
        "ＡＢ"
      ],
      [
        6857,
        6859,
        "ＡＢ"
      ],
      [
        7873,
        7875,
        "ＡＢ"
      ]
    ]
  ],
  [
    "markdown-table/readme.md",
    "f829c8d3ae8330796531fd626cf5f63efc63433c20b1208f2f10a44951f1f51e",
    "fa475c013dee2d7acfcb7b57361e8fb9a33730405d0f60c5cafab47fcde089a5",
    [
      [
        4956,
        4958,
        "ＡＢ"
      ],
      [
        5056,
        5058,
        "ＡＢ"
      ],
      [
        5230,
        5232,
        "ＡＢ"
      ],
      [
        5378,
        5380,
        "ＡＢ"
      ]
    ]
  ],
  [
    "nanoid/README.md",
    "54449254570e72b9eac5e3fafa9232eccffcc2f1de403a4dae02b2ffabee720f",
    "6204ff10d22e5bf9d7e82e3a90d3d931d7b2ed85b38154cc6d746498c9f72f8c",
    [
      [
        184,
        191,
        "<!-- Alternate-language link omitted in this local edition"
      ],
      [
        192,
        202,
        " "
      ],
      [
        203,
        209,
        "->"
      ]
    ]
  ],
  [
    "remark-gfm/readme.md",
    "22ac117c9fced0eac382eda19c92ec105614973ef69f3ba9f395e3d86c146e87",
    "ddd34f5ffeb6d85c6e08244132b659c79cc815bae2bcfdc450d4255942c96a66",
    [
      [
        7338,
        7340,
        "ＡＢ"
      ],
      [
        7617,
        7619,
        "ＡＢ"
      ],
      [
        8386,
        8388,
        "ＡＢ"
      ]
    ]
  ],
  [
    "postject/node_modules/commander/Readme.md",
    "9302a0d134a19d02552e88834f70c4bd0b8802a4bbc0a74acce99a52798d8106",
    "3eb840c75b35f4abc8ddc3bc076098a3f222c0e6dba6fd1fc6f46ae12c420aad",
    [
      [
        620,
        637,
        ""
      ],
      [
        644,
        654,
        ""
      ],
      [
        655,
        672,
        ""
      ]
    ]
  ],
  [
    "pdfjs-dist/node_modules/@napi-rs/canvas/README.md",
    "a26f13dc2b25969bc486210d4d6de2adf0d2cd856a7e4cb5ea2899163842f3a9",
    "fcf416da0ab099a8a74091b03d8840710648a75771baf48c181df00f7c314510",
    [
      [
        722,
        729,
        "<!-- Alternate-language link omitted in this local edition"
      ],
      [
        730,
        737,
        " "
      ],
      [
        738,
        744,
        "->"
      ]
    ]
  ],
  [
    "string-width/readme.md",
    "cd4aaf53cc7df4210595512d1fdfcd78b671da703a7e695673fcecc167ec66a3",
    "5c55d2a6547ac74c4d1741cae1d6f02430134ba2543d8dcdc133a17552585b5b",
    [
      [
        567,
        568,
        "Ａ"
      ],
      [
        602,
        603,
        "Ａ"
      ]
    ]
  ]
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Adapt reviewed documentation examples without touching dependency code or notices. */
export async function adaptDependencyDocs() {
  const lock = JSON.parse(await fs.readFile(path.join(project, 'package-lock.json'), 'utf8'));
  for (const [relative, originalHash, adaptedHash, spans] of edits) {
    const filename = path.join(project, 'node_modules', relative);
    const packageDir = path.dirname(filename);
    let pkg;
    try { pkg = JSON.parse(await fs.readFile(path.join(packageDir, 'package.json'), 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT' && relative.includes('/node_modules/')) continue;
      throw error;
    }
    const key = 'node_modules/' + path.posix.dirname(relative);
    const locked = lock.packages?.[key];
    if (!locked || pkg.version !== locked.version) throw new Error(`Dependency documentation version mismatch: ${relative}`);
    const bytes = await fs.readFile(filename);
    const hash = sha256(bytes);
    if (hash === adaptedHash) continue;
    if (hash !== originalHash) throw new Error(`Dependency documentation differs from reviewed text: ${relative}`);
    let content = bytes.toString('utf8');
    for (const [start, end, replacement] of [...spans].reverse()) content = content.slice(0, start) + replacement + content.slice(end);
    const adapted = Buffer.from(content, 'utf8');
    if (sha256(adapted) !== adaptedHash) throw new Error(`Dependency documentation adaptation failed: ${relative}`);
    await fs.writeFile(filename, adapted);
  }
}
