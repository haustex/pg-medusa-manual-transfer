# Invoice fonts

Noto Sans Regular, Noto Sans Bold and Noto Sans Mono Bold from the
[Noto project](https://github.com/notofonts/latin-greek-cyrillic), SIL Open Font License 1.1 (`OFL.txt`).

Subset with `fonttools subset --no-hinting` to Basic Latin, Latin-1, Latin Extended-A/B, IPA ə, spacing modifiers,
combining diacritics, Latin Extended Additional (Vietnamese), general punctuation, currency symbols, letterlike
symbols and a few arrows: every Latin-script name and address keeps its accents. The invoice embeds only the glyphs it
uses. Other scripts: set the plugin option `invoice.fontPath` to a font that covers them.
