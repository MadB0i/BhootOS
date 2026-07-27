# Recording a short demo

The repository does not commit a generated GIF. To create one locally, install
[VHS](https://github.com/charmbracelet/vhs), build BhootOS, and record a
fast-mode route in a clean temporary user-data environment.

Create `demo.tape` outside the package contents:

```text
Output bhootos-demo.gif
Set Shell "bash"
Set FontSize 16
Set Width 900
Set Height 600
Set TypingSpeed 35ms

Type "node dist/cli.js --fast --no-color --ascii"
Enter
Sleep 1s
Type "1"
Enter
Sleep 1s
Type "2"
Enter
Sleep 1s
```

Then run:

```sh
vhs demo.tape
```

Use only enough choices to show the intro, narrative, and numbered input.
Review the recording for personal paths or save data before sharing it. Do not
add the generated GIF to the package `files` allowlist.
