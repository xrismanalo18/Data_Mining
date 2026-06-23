# Deal Health XGBoost Model Development

## Objective

Predict `Deal_Health_Score` on a 0–100 scale from the IT hardware sales contract workbook. The model is a supervised XGBoost regression model.

## 1. Source data

- Workbook: `it_hardware_sales_contracts_synthetic_1000.xlsx`
- Training sheet: `Synthetic Contracts`
- Records: 1,000
- Target: `Deal_Health_Score`

The workbook already contains the historical target. `Deal_Health_Band` and `Risk_Flag` are derived from that target and are excluded to prevent leakage.

## 2. Feature preparation

Identity and leakage fields are excluded: contract/client identifiers, contact details, the target, the health band, and the risk flag.

Date fields are converted into year, month, quarter, day-of-year, and calculated contract-duration features. Numeric missing values use the training median. Categorical missing values use the training mode, then categories are one-hot encoded. Unknown categories at prediction time are ignored safely.

## 3. Train and test split

The dataset is split before preprocessing:

- Training: 800 rows (80%)
- Testing: 200 rows (20%)
- Random seed: 42

All preprocessing is fitted only on the 800 training rows. The 200 test rows are held out until final evaluation.

## 4. Baseline

A mean-value regressor establishes the minimum useful benchmark:

- Baseline MAE: 14.65
- Baseline RMSE: 17.30
- Baseline R²: -0.006

## 5. XGBoost tuning

`RandomizedSearchCV` evaluates 24 hyperparameter combinations using five-fold cross-validation on the training partition only. It tunes tree count, depth, learning rate, row/column sampling, child weight, and L1/L2 regularization.

Best parameters:

- Estimators: 350
- Maximum depth: 3
- Learning rate: 0.04
- Subsample: 1.0
- Column sample per tree: 0.7
- Minimum child weight: 1
- L1 regularization: 0.05
- L2 regularization: 1.0

Best cross-validation MAE: 2.90.

## 6. Held-out test results

- MAE: 2.92 score points
- RMSE: 3.66 score points
- R²: 0.955
- MAE improvement over baseline: 80.1%

These metrics come only from the untouched 200-row test set.

## 7. Production scoring

The fitted preprocessing definitions and all 350 XGBoost trees are exported to `src/data/deal-health-model.json`. The Next.js API reproduces the same date preparation, missing-value handling, one-hot encoding, and tree traversal, so the UI can score uploaded workbooks without retraining.

Predicted scores are mapped to reporting bands:

- 90–100: Excellent
- 75–89.9: Healthy
- 60–74.9: Watch List
- 40–59.9: At Risk
- Below 40: Critical

## 8. Reproducibility

Run:

```powershell
python ml\train_deal_health_model.py
```

Outputs:

- `ml/artifacts/deal_health_xgboost.joblib`
- `ml/artifacts/metrics.json`
- `ml/artifacts/test_predictions.csv`
- `src/data/deal-health-model.json`
