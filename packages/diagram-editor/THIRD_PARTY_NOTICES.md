# Diagram editor third-party notices

The private Coral diagram editor uses these Slice 46 presentation dependencies:

- `radix-ui` 1.6.7, Copyright 2022 WorkOS, MIT License.
- `react-resizable-panels` 4.13.1, Copyright 2022 Brian Vaughn, MIT License.

The complete MIT license text for each dependency is included in its installed
package and source distribution. These dependencies are private implementation
details and are not exported by Coral's public packages.

## libavoided-js 0.1.2 — MIT License

The shared spatial router is bundled in Coral rendering code.

```text
MIT License

Copyright (c) 2026 Corey Thompson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## On-device editing model runtime

The opt-in on-device editing model loads these libraries from Coral's own
origin, and only after the user turns the feature on.

- `@huggingface/transformers` (Transformers.js) 4.3.2, by Hugging Face,
  Apache License 2.0. The same license text is in Coral's `LICENSE` file and
  in the installed package.
- `onnxruntime-web` (ONNX Runtime Web) 1.31.0-dev.20260914-8d85527a0,
  MIT License, reproduced below.

```text
MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## coralsmol model weights — LFM Open License v1.0

The on-device editing model (`coralsmol-lfm230-r2e-q4`) is a full-parameter
fine-tune of Liquid AI's LFM2.5-230M for compact diagram editing, exported to
ONNX by the Coral project. It is not covered by Coral's Apache-2.0 license
and is not part of any npm package. Users download it separately from a
pinned Hugging Face revision after opting in. The download carries the full
license as `LICENSE` and a `LICENSE.md` note that the model is covered by
that license and was modified by the Coral project.

The license does not cover commercial use by a legal entity with annual
revenue of 10 million US dollars or more. A qualified non-profit organization
using the model for non-commercial or research purposes is exempt from that
threshold. The editor bundles the full license text as
`src/onDeviceModel/model-LICENSE.txt` and shows it in the enable dialog
before any download.
