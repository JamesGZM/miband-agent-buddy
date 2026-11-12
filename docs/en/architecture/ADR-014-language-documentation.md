# ADR-014: Documentation grouped by language

**English** · [简体中文](../../zh-CN/architecture/ADR-014-language-documentation.md) · [繁體中文](../../zh-TW/architecture/ADR-014-language-documentation.md)

## Problem

Sibling translations clutter the repository root and mix three languages in every guide directory.

## Decision

Keep one root README.md. Translated homepages live in docs/readme. Guides use matching relative paths under docs/en, docs/zh-CN and docs/zh-TW, each with a user/developer index. Shared images and original license texts remain shared. English root project policies, changelog and third-party notices retain their established GitHub/build entrypoints. Current architecture is docs/en/architecture/README.md and its translations. Retain only the established English architecture forwarding pages; migrate all in-repository links.

## Alternatives

Deleting translations reduces access. Moving only README files does not organize guides. Keeping one forwarding file for every translated old path would reproduce the clutter.

## Compatibility

The user explicitly authorized document relocation. Old translated root README and moved guide URLs no longer contain files. The original docs/architecture/README.md, docs/ARCHITECTURE.md and docs/open-source/ARCHITECTURE.md still point to the current architecture. Runtime, npm commands, license data paths and executable skills are unchanged.

## Evidence

Documentation contracts validate one root README, language switches, selected-language navigation, Markdown/HTML image links, anchors and identical executable examples. README artwork uses the production frontend and shared geometry with synthetic data; screenshots are not device photographs.
