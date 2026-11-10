# Nexus dev shell integration: unauthenticated dev markers (OSC 133 A/B/C/D). Not a security feature.
__nx_status=0
__nx_precmd() {
  local s=$?
  printf '\e]133;D;%s\a' "$s"
}
PROMPT_COMMAND=__nx_precmd
PS1='\[\e]133;A\a\]\u@sandbox:\w\$ \[\e]133;B\a\]'
PS0='\e]133;C\a'
