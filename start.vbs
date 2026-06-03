Set WShell = CreateObject("WScript.Shell")
WShell.Run "cmd /c cd /d E:\CC\workstation && node server.js", 0, False
