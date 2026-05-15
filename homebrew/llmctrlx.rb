class Llmctrlx < Formula
  desc "LLM Control Engine - local LLM orchestration and execution CLI with tool and plugin support"
  homepage "https://github.com/davidcrumpton/llm-control-engine"
  url "https://registry.npmjs.org/llmctrlx/-/llmctrlx-0.8.00.tgz"
  sha256 "..."
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", "--production", "--ignore-scripts"
    bin.install "llmctrlx.ts" => "llmctrlx"
    # Install shared resources (tools and plugins) into pkgshare
    # resolves to /usr/local/share/llmctrlx/
    (pkgshare/"tools").install Dir["tools/*"]
    (pkgshare/"plugins").install Dir["plugins/*"]
  end

  def caveats
    <<~EOS
      Tools are NOT loaded by default. To use the bundled tools, point llmctrlx at the
      shared tools directory using -T or LLMCTRLX_TOOLS_DIR:

        export LLMCTRLX_TOOLS_DIR="#{pkgshare}/tools"
        llmctrlx chat -u "What time is it?"

      Or create your own tools folder and copy/create tools there:
        mkdir -p ~/my-tools
        cp #{pkgshare}/tools/datetime.js ~/my-tools/
        llmctrlx chat -T ~/my-tools -u "What time is it?"

      To use the bundled plugins, copy them to your local plugins directory:
        mkdir -p ~/.llmctrlx_plugins
        cp #{pkgshare}/plugins/logger.plugin.js ~/.llmctrlx_plugins/
        cp #{pkgshare}/plugins/prompt-guard.plugin.js ~/.llmctrlx_plugins/
    EOS
  end

  test do
    assert_match "llmctrlx", shell_output("#{bin}/llmctrlx version")
  end
end