# NAND

NAND 是 NAMEWTA 的通用 Obsidian 工作台。看板、编辑器和桌面端编程智能体分成独立模块，在设置首页里分别打开或关闭。关掉的模块不会启动。

手机端可以使用看板和编辑器。终端和编程智能体只在桌面端启动。

插件 id 是 `nand`。看板、编辑器和终端的视图类型保持不变，已经固定在工作区里的标签还能打开。主题用到的 `apex-dashboard` 类名也保持不变。

## 安装

1. 从 [GitHub Releases](https://github.com/NAMEWTA/nand/releases) 下载发布包。
2. 把其中的 `nand` 文件夹放进库的 `.obsidian/plugins/`。
3. 在设置的第三方插件里启用 NAND。

以前装过旧 id 的库需要重新安装这份插件。设置不会自动迁到新目录。

功能区的首页图标打开设置首页。

## 资金参考

看板参考了 [PandoraReads/apex-dashboard](https://github.com/PandoraReads/apex-dashboard)（MIT）。终端参考了 [ZyphrZero/Termy](https://github.com/ZyphrZero/Termy)（GPL-3.0）。智能体启动与用量参考了 [stablyai/orca](https://github.com/stablyai/orca)（MIT）。感谢这些项目。
