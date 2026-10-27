<!-- Fixture: the sample person the "Just show me" demo and the phone layout load: Sam is made up, and the page's sample banner says so. No invite line, because the sample carries no code and its send is invite: none (Page copy.md, "The sample, and the three taps"), so it raises bad-invite, which the page does not show for the sample. Expect: warning bad-invite only; role both, so Projects with a folder for the project, Research and Clients; two pages, tasks.md 2 of 4 ticked, one database of 3 rows. -->
---
format: workspace-invite/1
name: Sam
platform: mac-apple-silicon
role: both
ai_tools: [claude-code, claude, chatgpt]
knowledge_tools: [obsidian, google-docs]
files_live_in: [obsidian-vault, git-repos, desktop]
project: Interview notes to findings, in one step
---

# Page: What I'm building
A small tool that reads a week of user-interview notes and drafts the findings report I used to write by hand. Claude Code builds it; Claude reads the notes and drafts the report.

The notes stay as plain files in my vault, so the agent and I are always looking at the same thing.

# Page: How I keep my files
Interview notes and research in an Obsidian vault, code in Git repositories, and drafts for clients in Google Docs. The Desktop is where everything lands first.

# Tasks
- [x] Collect last week's five interviews into one folder
- [x] Ask Claude Code for a script that pulls out the quotes
- [ ] Draft the findings report from the quotes
- [ ] Send the draft to the client for comments

# Database: Projects
| Name | Status | Started | Tool |
| --- | --- | --- | --- |
| Interview notes to findings | Building | 2026-09 | Claude Code |
| Client research wiki | Ongoing | 2026-04 | Obsidian |
| Conference talk | Planned | 2026-11 | Google Docs |
