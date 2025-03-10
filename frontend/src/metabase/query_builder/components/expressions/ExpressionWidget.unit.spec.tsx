import userEvent from "@testing-library/user-event";

import { getIcon, renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";

import type { ExpressionWidgetProps } from "./ExpressionWidget";
import { ExpressionWidget } from "./ExpressionWidget";
import { ExpressionWidgetHeader } from "./ExpressionWidgetHeader";
import type { StartRule } from "./types";

describe("ExpressionWidget", () => {
  it("should render proper controls", () => {
    setup();
    expect(screen.getByText("Expression")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("should not render Name field", () => {
    setup();

    expect(screen.queryByText("Name")).not.toBeInTheDocument();
  });

  it("should render help icon with tooltip which opens documentation page", async () => {
    setup();

    const icon = getIcon("info");
    expect(icon).toBeInTheDocument();

    const link = screen.getByRole("link", {
      name: "Open expressions documentation",
    });
    expect(link).toBeInTheDocument();

    expect(link).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/questions/query-builder/expressions.html?utm_source=product&utm_medium=docs&utm_campaign=custom-expressions&source_plan=oss",
    );

    await userEvent.hover(link);

    expect(
      await screen.findByText(
        "You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.",
      ),
    ).toBeInTheDocument();
  });

  it("should trigger onChangeClause if expression is valid", async () => {
    const { getRecentExpressionClauseInfo, onChangeClause } = await setup();

    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(doneButton).toBeDisabled();

    const expressionInput = screen.getByRole("textbox");

    await userEvent.type(expressionInput, "1 + 1");
    await userEvent.tab();

    expect(doneButton).toBeEnabled();

    await userEvent.click(doneButton);

    expect(onChangeClause).toHaveBeenCalledTimes(1);
    expect(onChangeClause).toHaveBeenCalledWith("", expect.anything());
    expect(getRecentExpressionClauseInfo().displayName).toBe("1 + 1");
  });

  it(`should render interactive header if it is passed`, async () => {
    const mockTitle = "Some Title";
    const onClose = jest.fn();
    setup({
      header: <ExpressionWidgetHeader title={mockTitle} onBack={onClose} />,
      onClose,
    });

    const titleEl = screen.getByText(mockTitle);
    expect(titleEl).toBeInTheDocument();

    await userEvent.click(titleEl);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("withName = true", () => {
    it("should render Name field", () => {
      setup({ withName: true });

      expect(screen.getByText("Name")).toBeInTheDocument();
    });

    it("should validate name value", async () => {
      const clause = Lib.expressionClause("+", [1, 1]);
      const { getRecentExpressionClauseInfo, onChangeClause } = await setup({
        withName: true,
        clause,
      });

      const doneButton = screen.getByRole("button", { name: "Done" });
      const expressionNameInput = screen.getByPlaceholderText(
        "Something nice and descriptive",
      );

      expect(doneButton).toBeDisabled();

      const input = await screen.findByDisplayValue("1 + 1");
      await userEvent.type(input, "{enter}");

      // enter in expression editor should not trigger "onChangeClause"
      // as popover is not valid with empty "name"
      expect(onChangeClause).toHaveBeenCalledTimes(0);

      // The name must not be empty
      await userEvent.clear(expressionNameInput);
      expect(doneButton).toBeDisabled();

      // The name must not consist of spaces or tabs only.
      await userEvent.type(expressionNameInput, " ");
      expect(doneButton).toBeDisabled();
      await userEvent.type(expressionNameInput, "\t");
      expect(doneButton).toBeDisabled();
      await userEvent.type(expressionNameInput, "  \t\t");
      expect(doneButton).toBeDisabled();

      await userEvent.clear(expressionNameInput);

      await userEvent.type(
        expressionNameInput,
        "Some n_am!e 2q$w&YzT(6i~#sLXv7+HjP}Ku1|9c*RlF@4o5N=e8;G*-bZ3/U0:Qa'V,t(W-_D",
      );

      expect(doneButton).toBeEnabled();

      await userEvent.click(doneButton);

      expect(onChangeClause).toHaveBeenCalledTimes(1);
      expect(onChangeClause).toHaveBeenCalledWith(
        "Some n_am!e 2q$w&YzT(6i~#sLXv7+HjP}Ku1|9c*RlF@4o5N=e8;G*-bZ3/U0:Qa'V,t(W-_D",
        expect.anything(),
      );
      expect(getRecentExpressionClauseInfo().displayName).toBe("1 + 1");
    });
  });

  describe("startRule = 'aggregation'", () => {
    it("should show 'unknown metric' error if the identifier is not recognized as a dimension (metabase#50753)", async () => {
      await setup({ startRule: "aggregation" });

      await userEvent.paste("[Imaginary]");
      await userEvent.tab();

      const doneButton = screen.getByRole("button", { name: "Done" });
      expect(doneButton).toBeDisabled();

      expect(screen.getByText("Unknown Metric: Imaginary")).toBeInTheDocument();
    });

    it("should show 'no aggregation found' error if the identifier is recognized as a dimension (metabase#50753)", async () => {
      await setup({ startRule: "aggregation" });

      await userEvent.paste("[Total] / [Subtotal]");
      await userEvent.tab();

      const doneButton = screen.getByRole("button", { name: "Done" });
      expect(doneButton).toBeDisabled();

      expect(
        screen.getByText(
          "No aggregation found in: Total. Use functions like Sum() or custom Metrics",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("startRule = 'expression'", () => {
    it("should show a detailed error when comma is missing (metabase#15892)", async () => {
      await setup({ startRule: "expression" });

      await userEvent.paste('concat([Tax] "test")');
      await userEvent.tab();

      const doneButton = screen.getByRole("button", { name: "Done" });
      expect(doneButton).toBeDisabled();

      expect(
        screen.getByText('Expecting comma but got "test" instead'),
      ).toBeInTheDocument();
    });
  });
});

async function setup<S extends StartRule = "expression">(
  additionalProps?: Partial<ExpressionWidgetProps<S>>,
) {
  const query = createQuery();
  const stageIndex = 0;
  const onChangeClause = jest.fn();
  const onClose = jest.fn();

  function getRecentExpressionClause(): Lib.Clause {
    expect(onChangeClause).toHaveBeenCalled();
    const [_name, clause] = onChangeClause.mock.lastCall;
    return clause;
  }

  function getRecentExpressionClauseInfo() {
    return Lib.displayInfo(query, stageIndex, getRecentExpressionClause());
  }

  renderWithProviders(
    <ExpressionWidget
      clause={undefined}
      name={undefined}
      query={query}
      reportTimezone="UTC"
      stageIndex={stageIndex}
      onChangeClause={onChangeClause}
      onClose={onClose}
      {...additionalProps}
    />,
  );
  await waitFor(() =>
    expect(screen.getByTestId("custom-expression-query-editor")).toHaveProperty(
      "readOnly",
      false,
    ),
  );
  screen.getByTestId("custom-expression-query-editor").focus();

  return {
    getRecentExpressionClauseInfo,
    onChangeClause,
    onClose,
  };
}
