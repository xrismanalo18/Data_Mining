from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import RandomizedSearchCV, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBRegressor


RANDOM_STATE = 42
TARGET = "Deal_Health_Score"
EXCLUDED_COLUMNS = {
    TARGET,
    "Deal_Health_Band",
    "Risk_Flag",
    "Contract_ID",
    "Client_Name",
    "Client_Contact_Name",
    "Client_Email",
}
DATE_COLUMNS = ("Effective_Date", "Contract_End_Date")


def add_date_features(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    for column in DATE_COLUMNS:
        if column not in result:
            continue
        values = pd.to_datetime(result[column], errors="coerce")
        result[f"{column}_Year"] = values.dt.year
        result[f"{column}_Month"] = values.dt.month
        result[f"{column}_Quarter"] = values.dt.quarter
        result[f"{column}_DayOfYear"] = values.dt.dayofyear

    if all(column in result for column in DATE_COLUMNS):
        effective = pd.to_datetime(result["Effective_Date"], errors="coerce")
        contract_end = pd.to_datetime(result["Contract_End_Date"], errors="coerce")
        result["Calculated_Contract_Duration_Days"] = (contract_end - effective).dt.days

    return result.drop(columns=[column for column in DATE_COLUMNS if column in result])


def regression_metrics(actual: pd.Series, predicted: np.ndarray) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(mean_squared_error(actual, predicted) ** 0.5),
        "r2": float(r2_score(actual, predicted)),
    }


def parse_base_score(config: dict) -> float:
    raw = config["learner"]["learner_model_param"]["base_score"]
    if isinstance(raw, str) and raw.startswith("["):
        return float(json.loads(raw)[0])
    return float(raw)


def compact_tree(tree: dict) -> dict:
    return {
        "left": tree["left_children"],
        "right": tree["right_children"],
        "splitIndices": tree["split_indices"],
        "splitConditions": tree["split_conditions"],
        "defaultLeft": tree["default_left"],
        "baseWeights": tree["base_weights"],
    }


def export_browser_model(
    pipeline: Pipeline,
    metrics: dict,
    output_path: Path,
) -> None:
    preprocessor: ColumnTransformer = pipeline.named_steps["preprocessor"]
    model: XGBRegressor = pipeline.named_steps["model"]
    feature_names = preprocessor.get_feature_names_out().tolist()
    numeric_columns = list(preprocessor.transformers_[0][2])
    categorical_columns = list(preprocessor.transformers_[1][2])
    numeric_imputer: SimpleImputer = preprocessor.named_transformers_["numeric"]
    categorical_pipeline: Pipeline = preprocessor.named_transformers_["categorical"]
    categorical_imputer: SimpleImputer = categorical_pipeline.named_steps["imputer"]
    encoder: OneHotEncoder = categorical_pipeline.named_steps["encoder"]

    booster = model.get_booster()
    raw_model = json.loads(booster.save_raw(raw_format="json"))
    config = json.loads(booster.save_config())
    trees = raw_model["learner"]["gradient_booster"]["model"]["trees"]
    importances = booster.get_score(importance_type="gain")
    ranked_importances = sorted(
        (
            {
                "feature": feature_names[int(key[1:])] if key.startswith("f") else key,
                "gain": float(value),
            }
            for key, value in importances.items()
        ),
        key=lambda item: item["gain"],
        reverse=True,
    )

    artifact = {
        "version": 1,
        "target": TARGET,
        "baseScore": parse_base_score(config),
        "numericColumns": numeric_columns,
        "numericMedians": {
            column: float(value)
            for column, value in zip(numeric_columns, numeric_imputer.statistics_, strict=True)
        },
        "categoricalColumns": categorical_columns,
        "categoricalFallbacks": {
            column: str(value)
            for column, value in zip(categorical_columns, categorical_imputer.statistics_, strict=True)
        },
        "categoricalValues": {
            column: [str(value) for value in values]
            for column, values in zip(categorical_columns, encoder.categories_, strict=True)
        },
        "featureNames": feature_names,
        "trees": [compact_tree(tree) for tree in trees],
        "featureImportances": ranked_importances[:20],
        "metrics": metrics,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(artifact, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    workbook_path = Path(
        r"C:\Users\Cris\Downloads\it_hardware_sales_contracts_synthetic_1000.xlsx"
    )
    artifact_dir = project_root / "ml" / "artifacts"

    data = pd.read_excel(workbook_path, sheet_name="Synthetic Contracts")
    data = add_date_features(data)
    features = data.drop(columns=[column for column in EXCLUDED_COLUMNS if column in data])
    target = data[TARGET].astype(float)

    train_features, test_features, train_target, test_target = train_test_split(
        features,
        target,
        test_size=0.20,
        random_state=RANDOM_STATE,
    )

    numeric_columns = features.select_dtypes(include=["number", "bool"]).columns.tolist()
    categorical_columns = [column for column in features.columns if column not in numeric_columns]

    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", SimpleImputer(strategy="median"), numeric_columns),
            (
                "categorical",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "encoder",
                            OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                        ),
                    ]
                ),
                categorical_columns,
            ),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "model",
                XGBRegressor(
                    objective="reg:squarederror",
                    eval_metric="rmse",
                    random_state=RANDOM_STATE,
                    n_jobs=1,
                    tree_method="hist",
                ),
            ),
        ]
    )

    parameter_distributions = {
        "model__n_estimators": [150, 250, 350, 500],
        "model__max_depth": [2, 3, 4, 5],
        "model__learning_rate": [0.02, 0.04, 0.06, 0.1],
        "model__subsample": [0.75, 0.9, 1.0],
        "model__colsample_bytree": [0.7, 0.85, 1.0],
        "model__min_child_weight": [1, 3, 5],
        "model__reg_alpha": [0.0, 0.05, 0.2],
        "model__reg_lambda": [1.0, 2.0, 5.0],
    }
    search = RandomizedSearchCV(
        estimator=pipeline,
        param_distributions=parameter_distributions,
        n_iter=24,
        scoring="neg_mean_absolute_error",
        cv=5,
        random_state=RANDOM_STATE,
        n_jobs=-1,
        verbose=1,
        return_train_score=True,
    )
    search.fit(train_features, train_target)
    best_pipeline: Pipeline = search.best_estimator_
    predictions = np.clip(best_pipeline.predict(test_features), 0, 100)

    baseline = DummyRegressor(strategy="mean")
    baseline.fit(np.zeros((len(train_target), 1)), train_target)
    baseline_predictions = baseline.predict(np.zeros((len(test_target), 1)))

    model_metrics = regression_metrics(test_target, predictions)
    baseline_metrics = regression_metrics(test_target, baseline_predictions)
    metrics = {
        "dataset": {
            "rows": int(len(data)),
            "featuresBeforeEncoding": int(features.shape[1]),
            "trainingRows": int(len(train_features)),
            "testingRows": int(len(test_features)),
            "testSize": 0.20,
            "randomState": RANDOM_STATE,
        },
        "model": model_metrics,
        "baseline": baseline_metrics,
        "maeImprovementPct": float(
            (baseline_metrics["mae"] - model_metrics["mae"])
            / baseline_metrics["mae"]
            * 100
        ),
        "crossValidation": {
            "folds": 5,
            "bestMeanMae": float(-search.best_score_),
            "bestParameters": search.best_params_,
        },
    }

    artifact_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(best_pipeline, artifact_dir / "deal_health_xgboost.joblib")
    pd.DataFrame(
        {
            "actual": test_target.to_numpy(),
            "predicted": predictions,
            "absolute_error": np.abs(test_target.to_numpy() - predictions),
        },
        index=test_target.index,
    ).sort_index().to_csv(artifact_dir / "test_predictions.csv", index_label="source_row")
    (artifact_dir / "metrics.json").write_text(
        json.dumps(metrics, indent=2),
        encoding="utf-8",
    )
    export_browser_model(
        best_pipeline,
        metrics,
        project_root / "src" / "data" / "deal-health-model.json",
    )

    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
