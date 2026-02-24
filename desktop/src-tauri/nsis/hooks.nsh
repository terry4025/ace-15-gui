; ACE-Step Studio - NSIS hooks
; This is included by Tauri's NSIS template when configured via `bundle.windows.nsis.installerHooks`.
;
; Goal: always create a Desktop shortcut by default (no prompt).

!macro NSIS_HOOK_POSTINSTALL
  ; $INSTDIR is the chosen installation directory.
  ; ${MAINBINARYNAME} is provided by Tauri's NSIS template.
  CreateShortCut "$DESKTOP\\ACE-Step Studio.lnk" "$INSTDIR\\${MAINBINARYNAME}.exe"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$DESKTOP\\ACE-Step Studio.lnk"
!macroend

