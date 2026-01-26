import { runProcess } from "../../src/run_process.js";

describe("validate common commands work", () => {

    // TODO! add integration tests of all the common commands you will use
    //   AND common scenarios of each that materially are affected by how STDIO and process are setup
    // i.e. grep, sed, fd, ls, pwd, git (status,...?), ...

    describe("ripgrep", () => {
        test("ripgrep shouldn't hang on searching STDIN when there's no STDIN", async () => {
            // previously using `child_process.exec()` resulted in `rg` hanging
            //   b/c rg sees STDIN==socket => sets is_stdin_readable
            //   => IIUC STDIN never closes => thus rg hangs until timeout
            //
            // * `spawn` allows controlling STDIO (unlike `exec`)
            //   spawn defaults to `pipe` which rg also sees as socket/searchable
            //   * setting STDIN to `ignore` attaches /dev/null
            //   => ripgrep doesn't hang now (and is_stdin_readable=false)

            // * --debug output, key output 
            //   > for heuristic stdin detection on Unix, found that is_file=false, is_fifo=false and is_socket=true, 
            //   > and thus concluded that is_stdin_readable=true\nrg: DEBUG|rg::flags::hiargs
            const request = runProcess({
                mode: "executable",
                argv: ["rg", "--debug", "foo"],
                timeout_ms: 10, // FYI set timeout_ms so you get result object below
                // if you let test itself timeout, you won't get result object to assert below
            });

            const result = await request;
            // console.log(result);
            expect(result.content).toEqual(
                expect.arrayContaining([
                    {
                        name: "STDERR",
                        type: "text",
                        text: expect.not.stringContaining("concluded that is_stdin_readable=true")
                    }
                ])
            );

        });
        test("ripgrep can search over STDIN when STDIN is provided", async () => {
            const result = await runProcess({
                mode: "executable",
                argv: ["rg", "bar"],
                input: "foo\nbar\nbaz",
                timeout_ms: 5000,
            });
            // console.log(result);
            expect(result.content).toEqual(
                expect.arrayContaining([{
                    name: "STDOUT",
                    type: "text",
                    text: "2:1:bar\n",
                }])
            );

        });
    });

});

