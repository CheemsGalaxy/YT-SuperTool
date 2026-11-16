Option Explicit

Dim fso, shell, scriptDir, configPath, config
Dim nodeExe, appEntry, dataDir, port, pairingCodeFile
Dim mode, command

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
configPath = fso.BuildPath(scriptDir, "paths.json")
If Not fso.FileExists(configPath) Then
  WScript.Quit 1
End If

config = ReadText(configPath)
nodeExe = JsonValue(config, "nodeExe")
appEntry = JsonValue(config, "appEntry")
dataDir = JsonValue(config, "dataDir")
port = JsonValue(config, "port")
pairingCodeFile = JsonValue(config, "pairingCodeFile")

If nodeExe = "" Or appEntry = "" Or dataDir = "" Or port = "" Then
  WScript.Quit 1
End If
If Not fso.FileExists(nodeExe) Then
  WScript.Quit 1
End If
If Not fso.FileExists(appEntry) Then
  WScript.Quit 1
End If

mode = "start"
If WScript.Arguments.Count > 0 Then
  mode = LCase(WScript.Arguments(0))
End If

If mode <> "pair" Then
  If CompanionRunning(port) Then
    WScript.Quit 0
  End If
End If

command = """" & nodeExe & """ """ & appEntry & """ --port " & port & " --data-dir """ & dataDir & """"
If mode = "pair" Then
  command = command & " --pair"
  If pairingCodeFile <> "" Then
    command = command & " --pair-code-file """ & pairingCodeFile & """"
  End If
End If

shell.Run command, 0, False

Function ReadText(path)
  Dim file
  Set file = fso.OpenTextFile(path, 1, False, -1)
  ReadText = file.ReadAll
  file.Close
End Function

Function JsonValue(text, key)
  Dim expression, matches
  Set expression = New RegExp
  expression.Pattern = """" & key & """" & "\s*:\s*(?:""((?:[^""\\]|\\.)*)""|(-?[0-9]+))"
  expression.Global = False
  expression.IgnoreCase = False
  Set matches = expression.Execute(text)
  If matches.Count = 0 Then
    JsonValue = ""
    Exit Function
  End If
  If matches(0).SubMatches(1) <> "" Then
    JsonValue = matches(0).SubMatches(1)
  Else
    JsonValue = UnescapeJson(matches(0).SubMatches(0))
  End If
End Function

Function UnescapeJson(value)
  Dim result, index, character, code
  result = ""
  index = 1
  Do While index <= Len(value)
    character = Mid(value, index, 1)
    If character = "\" And index < Len(value) Then
      index = index + 1
      character = Mid(value, index, 1)
      Select Case character
        Case "\"
          result = result & "\"
        Case """"
          result = result & """"
        Case "/"
          result = result & "/"
        Case "n"
          result = result & vbLf
        Case "r"
          result = result & vbCr
        Case "t"
          result = result & vbTab
        Case "b"
          result = result & Chr(8)
        Case "f"
          result = result & Chr(12)
        Case "u"
          If index + 4 <= Len(value) Then
            code = CLng("&H" & Mid(value, index + 1, 4))
            result = result & ChrW(code)
            index = index + 4
          End If
        Case Else
          result = result & character
      End Select
    Else
      result = result & character
    End If
    index = index + 1
  Loop
  UnescapeJson = result
End Function

Function CompanionRunning(portNumber)
  Dim http
  CompanionRunning = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  If Err.Number <> 0 Then
    Err.Clear
    On Error GoTo 0
    Exit Function
  End If
  http.setTimeouts 300, 300, 1000, 1000
  http.Open "GET", "http://127.0.0.1:" & portNumber & "/api/health", False
  http.Send
  If Err.Number = 0 Then
    If http.Status = 200 Then
      If InStr(http.ResponseText, "yt-super-tool-companion") > 0 Then
        CompanionRunning = True
      End If
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Function
